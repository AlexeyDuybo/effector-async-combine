import {createField} from '@effector-reform/core';
import { asyncCombine } from '../../src';
import {createEvent, type Event, sample} from 'effector';
import {createAction} from 'effector-action';

export const  formModelFactory = 
    (init: Event<{ description: string }>) => {
            const descriptionField = createField<string>('');
            
            const descriptionValidationAsync = asyncCombine(
                descriptionField.$value,
                (description) => {
                    return { valid: true };
                }
            );

            const isFormValidAsync = asyncCombine(
                {
                    descriptionValidationAsync,
                },
                (
                    { 
                    descriptionValidation, 
                }
            ) => {
                    return (
                        descriptionValidation.valid
                    )
                }
            );

            sample({ 
                clock: init,
                target: [
                    isFormValidAsync.trigger,
                    descriptionValidationAsync.trigger
                ]
            })
    
            createAction(init, {
                target: {
                    setDescription: descriptionField.change,
                },
                fn: (target, { description }) => {
                    target.setDescription(description);
                },
            });
    
            return {
                ui: {
                    saveForm: createEvent<any>(),
                    descriptionField,
                    isFormValidAsync,
                },
            };
        };

